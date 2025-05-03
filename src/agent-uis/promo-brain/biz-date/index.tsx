import { useStreamContext, type UIMessage } from "@langchain/langgraph-sdk/react-ui";
import { getToolResponse } from "../../utils/get-tool-response";
import { CalendarDays } from "lucide-react";
import { Message } from "@langchain/langgraph-sdk";

interface BizDateProps {
  toolCallId: string;
}

type StreamContextType = ReturnType<
  typeof useStreamContext<
    { messages: Message[]; ui: UIMessage[] },
    { MetaType: { ui: UIMessage | undefined } }
  >
>;

export default function BizDate({ toolCallId }: BizDateProps) {
  const thread = useStreamContext<
    { messages: Message[]; ui: UIMessage[] },
    { MetaType: { ui: UIMessage | undefined } }
  >();
  const toolResponse = getToolResponse(toolCallId, thread);
  
  if (!toolResponse) {
    return null;
  }

  let bizDate = "";
  let humanReadableDate = "";

  try {
    if (toolResponse.content) {
      const content = JSON.parse(toolResponse.content as string);
      bizDate = content.biz_date;
      humanReadableDate = content.human_readable;
    }
  } catch (error) {
    console.error("Failed to parse tool response", error);
    return null;
  }

  return (
    <div className="flex flex-col gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-4 mb-2">
      <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <CalendarDays className="w-4 h-4" />
        <span className="font-semibold">Business Date Tool</span>
      </div>
      <div className="text-md">
        <p>Business Date: <span className="font-mono">{bizDate}</span></p>
        <p>Date: {humanReadableDate}</p>
      </div>
    </div>
  );
} 