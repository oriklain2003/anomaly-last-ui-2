import { ReactNode, useState } from 'react';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';

export interface Column {
  key: string;
  title: string;
  render?: (value: any, row: any) => ReactNode;
  sortable?: boolean;
  exportValue?: (value: any, row: any) => string | number; // Custom export formatter
}

interface TableCardProps {
  title: string;
  columns: Column[];
  data: any[];
  sortable?: boolean;
  filterable?: boolean;
  className?: string;
  exportable?: boolean; // Enable CSV export
  exportFilename?: string; // Custom filename for export
}

export function TableCard({ 
  title, 
  columns, 
  data, 
  sortable = true, 
  className = '',
  exportable = true,
  exportFilename
}: TableCardProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (columnKey: string) => {
    if (!sortable) return;
    
    if (sortKey === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(columnKey);
      setSortDirection('asc');
    }
  };

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortDirection === 'asc'
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      })
    : data;

  const exportToCSV = () => {
    if (data.length === 0) return;
    
    // Build CSV header
    const headers = columns.map(col => `"${col.title}"`).join(',');
    
    // Build CSV rows
    const rows = sortedData.map(row => {
      return columns.map(col => {
        let value: any;
        if (col.exportValue) {
          value = col.exportValue(row[col.key], row);
        } else {
          value = row[col.key];
        }
        
        // Handle different types
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'string') {
          // Escape quotes and wrap in quotes
          return `"${value.replace(/"/g, '""')}"`;
        }
        if (typeof value === 'number') {
          return value;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',');
    }).join('\n');
    
    const csv = `${headers}\n${rows}`;
    
    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${exportFilename || title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-surface rounded-xl p-6 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white text-lg font-bold">{title}</h3>
        {exportable && data.length > 0 && (
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            title="Export to CSV"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left text-white/60 text-sm font-medium py-3 px-4 ${
                    sortable && col.sortable !== false ? 'cursor-pointer hover:text-white' : ''
                  }`}
                  onClick={() => sortable && col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.title}
                    {sortable && col.sortable !== false && sortKey === col.key && (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                {columns.map((col) => (
                  <td key={col.key} className="text-white text-sm py-3 px-4">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        {sortedData.length === 0 && (
          <div className="text-center text-white/40 py-8">No data available</div>
        )}
      </div>
    </div>
  );
}

