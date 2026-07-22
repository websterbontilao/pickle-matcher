import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  changeResult,
  recordResult,
  startMatch,
  swapPlayerInMatch,
  type RecordResultInput,
  type StartMatchInput,
  type SwapPlayerInput,
} from "@/lib/mutations/rounds";

export const useStartMatch = () => useSessionMutation<StartMatchInput>(startMatch);
export const useSwapPlayerInMatch = () => useSessionMutation<SwapPlayerInput>(swapPlayerInMatch);
export const useRecordResult = () => useSessionMutation<RecordResultInput>(recordResult);
export const useChangeResult = () => useSessionMutation<RecordResultInput>(changeResult);
