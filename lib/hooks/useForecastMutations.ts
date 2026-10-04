import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  clearPlannedMatches,
  swapInForecast,
  unlockPlannedMatch,
  type ForecastSwapInput,
  type UnlockPlannedMatchInput,
} from "@/lib/mutations/forecast";

export const useSwapInForecast = () => useSessionMutation<ForecastSwapInput>(swapInForecast);
export const useUnlockPlannedMatch = () => useSessionMutation<UnlockPlannedMatchInput>(unlockPlannedMatch);
export const useClearPlannedMatches = () => useSessionMutation<void>(clearPlannedMatches);
