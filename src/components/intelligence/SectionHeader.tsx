import { ReactNode } from 'react';
import { QuestionTooltip } from './QuestionTooltip';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  question?: { he: string; en?: string; level?: string };
  className?: string;
}

export function SectionHeader({ title, subtitle, icon, question, className = '' }: SectionHeaderProps) {
  return (
    <div className={`border-b border-white/10 pb-4 ${className}`}>
      <h2 className="text-white text-xl font-bold mb-2 flex items-center gap-2">
        {icon}
        {title}
        {question && (
          <QuestionTooltip 
            question={question.he} 
            questionEn={question.en} 
            level={question.level} 
          />
        )}
      </h2>
      {subtitle && (
        <p className="text-white/60 text-sm">{subtitle}</p>
      )}
    </div>
  );
}

