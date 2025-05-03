import {
  Annotation,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { format, subDays } from "date-fns";
import fs from "fs";
import path from "path";
import { findToolCall } from "../find-tool-call";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { typedUi } from "@langchain/langgraph-sdk/react-ui/server";
import type ComponentMap from "../../agent-uis/index";
import { GenerativeUIAnnotation } from "../types";

const PromoBrainAgentAnnotation = Annotation.Root({
  messages: MessagesAnnotation.spec["messages"],
  ui: GenerativeUIAnnotation.spec.ui,
  timestamp: Annotation<number>(),
});

// 简化schema，不需要参数
const getBizDateSchema = z.object({});

// 预览CSV文件的schema，需要文件名参数
const previewCsvSchema = z.object({
  filename: z.string().describe("The name of the CSV file to preview"),
});

const PROMO_BRAIN_TOOLS = [
  {
    name: "get-biz-date",
    description: "A tool to get the current business date, which is the previous day in yyyyMMdd format",
    schema: getBizDateSchema,
  },
  {
    name: "preview-csv",
    description: "A tool to preview CSV files stored in the src/agent/promo-brain-agent/data directory or its subdirectories",
    schema: previewCsvSchema,
  },
];

// 查找CSV文件的函数
function findCsvFile(filename: string): string | null {
  const baseDir = path.resolve(process.cwd(), "src/agent/promo-brain-agent/data");
  console.log("Looking for CSV file in directory:", baseDir);
  
  // 递归查找文件
  function findInDir(dir: string): string | null {
    try {
      console.log("Searching in directory:", dir);
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          const found = findInDir(filePath);
          if (found) return found;
        } else if (file === filename || file === `${filename}.csv`) {
          console.log("Found CSV file:", filePath);
          return filePath;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error searching in directory ${dir}:`, error);
      return null;
    }
  }
  
  try {
    return findInDir(baseDir);
  } catch (error) {
    console.error("Error finding CSV file:", error);
    return null;
  }
}

// 解析CSV文件的函数
function parseCsvFile(filePath: string): { headers: string[], rows: string[][] } | null {
  try {
    console.log("Parsing CSV file:", filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 处理不同的行结束符
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length === 0) {
      console.log("CSV file is empty");
      return { headers: [], rows: [] };
    }
    
    // 检测分隔符（假设是逗号或制表符）
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    console.log(`Detected delimiter: "${delimiter}"`);
    
    const headers = lines[0].split(delimiter).map(header => header.trim().replace(/^"(.*)"$/, '$1'));
    
    // 解析数据行
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        // 简单的CSV解析，未处理引号内的逗号等复杂情况
        const row = line.split(delimiter).map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
        rows.push(row);
      }
    }
    
    console.log(`Parsed CSV with ${headers.length} columns and ${rows.length} data rows`);
    return { headers, rows };
  } catch (error) {
    console.error("Error parsing CSV file:", error);
    return null;
  }
}

const graph = new StateGraph(PromoBrainAgentAnnotation)
  .addNode("promoBrainAgent", async (state, config: LangGraphRunnableConfig) => {
    const ui = typedUi<typeof ComponentMap>(config);
    const model = new ChatOpenAI({
      model: "gpt-4o-mini",
    });

    const message = await model.bindTools(PROMO_BRAIN_TOOLS).invoke([
      { 
        role: "system", 
        content: "You are a helpful assistant that can get the current business date and preview CSV files. If the user asks about the biz_date or business date, use the get-biz-date tool. If the user asks to preview or view a CSV file, use the preview-csv tool."
      },
      ...state.messages,
    ]);

    const getBizDateToolCall = message.tool_calls?.find(
      findToolCall("get-biz-date")
    );

    const previewCsvToolCall = message.tool_calls?.find(
      findToolCall("preview-csv")
    );

    // 添加调试日志
    if (previewCsvToolCall) {
      console.log("Found preview-csv tool call:", JSON.stringify(previewCsvToolCall, null, 2));
    }

    if (getBizDateToolCall) {
      // Calculate previous day's date once and reuse
      const bizDateObj = subDays(new Date(), 1);
      const bizDate = format(bizDateObj, "yyyyMMdd");
      const humanReadableDate = format(bizDateObj, "MMMM d, yyyy");
      
      // Create a tool response message
      const toolResponse = {
        role: "tool",
        tool_call_id: getBizDateToolCall.id ?? "",
        name: "get-biz-date",
        content: JSON.stringify({ 
          biz_date: bizDate,
          human_readable: humanReadableDate
        }),
      };
      
      // Create an AI response after the tool call
      const aiResponse = {
        role: "assistant",
        content: `The current business date is ${humanReadableDate} (${bizDate}).`,
      };

      // Push the UI component for biz-date
      ui.push(
        {
          name: "biz-date",
          props: {
            toolCallId: getBizDateToolCall.id ?? "",
          },
        },
        { message }
      );

      return {
        messages: [message, toolResponse, aiResponse],
        ui: ui.items,
        timestamp: Date.now(),
      };
    }

    if (previewCsvToolCall) {
      try {
        // 更加安全地处理args字段
        let filename = "";
        
        if (typeof previewCsvToolCall.args === 'string') {
          try {
            const parsedArgs = JSON.parse(previewCsvToolCall.args);
            filename = parsedArgs.filename || "";
          } catch (parseError) {
            console.error("Failed to parse tool call args:", parseError);
          }
        } else if (typeof previewCsvToolCall.args === 'object' && previewCsvToolCall.args !== null) {
          filename = previewCsvToolCall.args.filename || "";
        }
        
        // 检查文件名是否为空
        if (!filename) {
          const toolResponse = {
            role: "tool",
            tool_call_id: previewCsvToolCall.id ?? "",
            name: "preview-csv",
            content: JSON.stringify({ 
              error: "No filename provided. Please specify a CSV file to preview."
            }),
          };
          
          const aiResponse = {
            role: "assistant",
            content: "I need a filename to preview a CSV file. Please provide a valid filename.",
          };
          
          ui.push(
            {
              name: "csv-preview",
              props: {
                toolCallId: previewCsvToolCall.id ?? "",
              },
            },
            { message }
          );
          
          return {
            messages: [message, toolResponse, aiResponse],
            ui: ui.items,
            timestamp: Date.now(),
          };
        }
        
        // 查找CSV文件
        const filePath = findCsvFile(filename);
        
        if (!filePath) {
          // 文件未找到
          const toolResponse = {
            role: "tool",
            tool_call_id: previewCsvToolCall.id ?? "",
            name: "preview-csv",
            content: JSON.stringify({ 
              filename,
              error: `CSV file "${filename}" not found in the data directory or its subdirectories.`
            }),
          };
          
          const aiResponse = {
            role: "assistant",
            content: `I couldn't find the CSV file "${filename}" in the data directory. Please make sure the file exists and try again.`,
          };
          
          ui.push(
            {
              name: "csv-preview",
              props: {
                toolCallId: previewCsvToolCall.id ?? "",
              },
            },
            { message }
          );
          
          return {
            messages: [message, toolResponse, aiResponse],
            ui: ui.items,
            timestamp: Date.now(),
          };
        }
        
        // 解析CSV文件
        const csvData = parseCsvFile(filePath);
        
        if (!csvData) {
          // 解析错误
          const toolResponse = {
            role: "tool",
            tool_call_id: previewCsvToolCall.id ?? "",
            name: "preview-csv",
            content: JSON.stringify({ 
              filename,
              error: `Failed to parse CSV file "${filename}". The file may be corrupted or in an invalid format.`
            }),
          };
          
          const aiResponse = {
            role: "assistant",
            content: `I found the CSV file "${filename}", but I couldn't parse its contents. The file might be corrupted or in an invalid format.`,
          };
          
          ui.push(
            {
              name: "csv-preview",
              props: {
                toolCallId: previewCsvToolCall.id ?? "",
              },
            },
            { message }
          );
          
          return {
            messages: [message, toolResponse, aiResponse],
            ui: ui.items,
            timestamp: Date.now(),
          };
        }
        
        // 成功解析
        const { headers, rows } = csvData;
        const toolResponse = {
          role: "tool",
          tool_call_id: previewCsvToolCall.id ?? "",
          name: "preview-csv",
          content: JSON.stringify({ 
            filename,
            headers,
            rows
          }),
        };
        
        const rowCount = rows.length;
        const aiResponse = {
          role: "assistant",
          content: `Here's a preview of the CSV file "${filename}". It contains ${rowCount} rows of data.`,
        };
        
        ui.push(
          {
            name: "csv-preview",
            props: {
              toolCallId: previewCsvToolCall.id ?? "",
            },
          },
          { message }
        );
        
        return {
          messages: [message, toolResponse, aiResponse],
          ui: ui.items,
          timestamp: Date.now(),
        };
        
      } catch (error) {
        console.error("Error processing preview-csv tool call:", error);
        
        let errorMessage = "An unexpected error occurred while processing the preview-csv request.";
        if (error instanceof Error) {
          errorMessage += ` Error: ${error.message}`;
        }
        
        const toolResponse = {
          role: "tool",
          tool_call_id: previewCsvToolCall.id ?? "",
          name: "preview-csv",
          content: JSON.stringify({ 
            error: errorMessage
          }),
        };
        
        const aiResponse = {
          role: "assistant",
          content: `I encountered an error while trying to preview the CSV file. ${errorMessage}`,
        };
        
        ui.push(
          {
            name: "csv-preview",
            props: {
              toolCallId: previewCsvToolCall.id ?? "",
            },
          },
          { message }
        );
        
        return {
          messages: [message, toolResponse, aiResponse],
          ui: ui.items,
          timestamp: Date.now(),
        };
      }
    }

    return {
      messages: [message],
      ui: ui.items,
      timestamp: Date.now(),
    };
  })
  .addEdge(START, "promoBrainAgent");

export const agent = graph.compile();
agent.name = "promo_brain_agent";
