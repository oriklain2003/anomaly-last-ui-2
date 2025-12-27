import { ReactNode } from 'react';
import { QuestionTooltip } from './QuestionTooltip';

interface ChartCardProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  question?: { he: string; en?: string; level?: string };
}

export function ChartCard({ title, children, actions, className = '', question }: ChartCardProps) {
  return (
    <div className={`bg-surface rounded-xl p-6 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-white text-lg font-bold">{title}</h3>
          {question && (
            <QuestionTooltip 
              question={question.he} 
              questionEn={question.en} 
              level={question.level} 
            />
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}

