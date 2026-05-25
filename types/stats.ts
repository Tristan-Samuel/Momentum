export interface CompletionBar {
  date: string;
  label: string;
  ratio: number;
}

export interface HeatmapCell {
  date: string;
  ratio: number;
}

export interface StreakSummary {
  current: number;
  best: number;
}

export interface StatsSummary {
  totalWorkoutsCompleted: number;
  totalPullUpsCompleted: number;
  weeklyCompletionPercentage: number;
  streaks: StreakSummary;
  heatmap: HeatmapCell[];
  completionBars: CompletionBar[];
}
