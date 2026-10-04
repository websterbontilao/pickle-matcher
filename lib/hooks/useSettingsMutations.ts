import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  setFormat,
  setResultEntry,
  startSession,
  stopSession,
  type SetFormatInput,
  type SetResultEntryInput,
} from "@/lib/mutations/settings";

export const useSetFormat = () => useSessionMutation<SetFormatInput>(setFormat);
export const useStartSession = () => useSessionMutation<void>(startSession);
export const useStopSession = () => useSessionMutation<void>(stopSession);
export const useSetResultEntry = () => useSessionMutation<SetResultEntryInput>(setResultEntry);
