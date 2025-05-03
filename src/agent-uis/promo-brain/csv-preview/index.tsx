import { useStreamContext, type UIMessage } from "@langchain/langgraph-sdk/react-ui";
import { getToolResponse } from "../../utils/get-tool-response";
import { Table, ChevronDown, ChevronUp } from "lucide-react";
import { Message } from "@langchain/langgraph-sdk";
import { useState, useEffect, useRef } from "react";

interface CSVPreviewProps {
  toolCallId: string;
}

export default function CSVPreview({ toolCallId }: CSVPreviewProps) {
  const thread = useStreamContext<
    { messages: Message[]; ui: UIMessage[] },
    { MetaType: { ui: UIMessage | undefined } }
  >();
  const toolResponse = getToolResponse(toolCallId, thread);
  const [isExpanded, setIsExpanded] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  
  useEffect(() => {
    // 检查表格是否需要横向滚动
    if (tableRef.current && scrollContainerRef.current) {
      const tableWidth = tableRef.current.offsetWidth;
      const containerWidth = scrollContainerRef.current.offsetWidth;
      setNeedsScroll(tableWidth > containerWidth);
    }
  }, [toolResponse]);
  
  if (!toolResponse) {
    return null;
  }

  let filename = "";
  let headers: string[] = [];
  let rows: string[][] = [];
  let error = "";

  try {
    if (toolResponse.content) {
      const content = JSON.parse(toolResponse.content as string);
      filename = content.filename;
      headers = content.headers || [];
      rows = content.rows || [];
      error = content.error || "";
    }
  } catch (e) {
    console.error("Failed to parse tool response", e);
    return null;
  }

  if (error) {
    return (
      <div className="border border-red-200 dark:border-red-800 rounded-md overflow-hidden mb-4 w-full max-w-full">
        <div className="bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <Table className="w-4 h-4" />
            <span className="font-semibold">CSV Preview Error</span>
          </div>
          <div className="mt-2 text-sm text-red-700 dark:text-red-300">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const rowCount = rows.length;
  const maxInitialRows = 5;
  const displayRows = isExpanded ? rows : rows.slice(0, maxInitialRows);
  const hasMoreRows = rows.length > maxInitialRows;

  // 计算表格宽度并设置列宽
  const maxColumns = Math.min(headers.length, 5); // 最多显示5列
  const visibleHeaders = headers.slice(0, maxColumns);
  const hasMoreColumns = headers.length > maxColumns;
  
  // 设置列宽，固定值
  const colWidth = 100; // 每列固定宽度

  return (
    <div className="mb-4 w-full" style={{ maxWidth: "100%" }}>
      <div className="border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden w-full">
        {/* 卡片标题 */}
        <div className="p-3 bg-slate-200 dark:bg-slate-700 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 overflow-hidden">
            <Table className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold truncate">{filename}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 ml-2">
            {rowCount} rows × {headers.length} columns
            {hasMoreColumns && <span className="ml-1 text-orange-500">({maxColumns}/{headers.length} cols shown)</span>}
          </div>
        </div>

        {/* 内部滚动容器 */}
        <div 
          ref={scrollContainerRef}
          className="overflow-x-auto bg-white dark:bg-slate-800"
          style={{ 
            maxHeight: isExpanded ? '400px' : '200px',
            width: '100%'
          }}
        >
          {/* 表格内容 */}
          <table 
            ref={tableRef}
            className="w-full border-collapse text-sm"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-100 dark:bg-slate-700">
                {visibleHeaders.map((header: string, index: number) => (
                  <th 
                    key={index}
                    className="py-2 px-2 text-left font-medium text-slate-700 dark:text-slate-300 border-b border-slate-300 dark:border-slate-600 truncate"
                    style={{ width: `${colWidth}px` }}
                    title={header}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row: string[], rowIndex: number) => (
                <tr 
                  key={rowIndex} 
                  className={rowIndex % 2 === 0 
                    ? 'bg-white dark:bg-slate-800' 
                    : 'bg-slate-50 dark:bg-slate-800/60'
                  }
                >
                  {row.slice(0, maxColumns).map((cell: string, cellIndex: number) => (
                    <td 
                      key={cellIndex} 
                      className="py-2 px-2 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 truncate"
                      style={{ width: `${colWidth}px` }}
                      title={cell}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* 表格底部提示信息 */}
        {hasMoreColumns && (
          <div className="p-2 text-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-t border-slate-200 dark:border-slate-700">
            Showing {maxColumns} of {headers.length} columns. Scroll horizontally to see more.
          </div>
        )}
      </div>

      {/* 展开/收起按钮 */}
      {hasMoreRows && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mx-auto"
        >
          {isExpanded ? (
            <>
              <ChevronUp size={16} />
              <span>Show fewer rows ({maxInitialRows})</span>
            </>
          ) : (
            <>
              <ChevronDown size={16} />
              <span>Show all rows ({rowCount})</span>
            </>
          )}
        </button>
      )}
      
      {/* 无数据提示 */}
      {rows.length === 0 && (
        <div className="w-full text-center p-4 text-slate-500 dark:text-slate-400">
          No data found
        </div>
      )}
    </div>
  );
} 