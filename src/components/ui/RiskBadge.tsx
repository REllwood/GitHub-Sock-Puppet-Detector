import { RiskLevel } from '@/types/analysis';

interface RiskBadgeProps {
  level: RiskLevel;
  score: number;
}

export default function RiskBadge({ level, score }: RiskBadgeProps) {
  const colors = {
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[level]}`}
    >
      {level.toUpperCase()} ({score.toFixed(0)})
    </span>
  );
}
