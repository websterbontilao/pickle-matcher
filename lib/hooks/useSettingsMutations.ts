import { useSessionMutation } from "@/lib/query/createSessionMutation";
import {
  setFormat,
  setResultEntry,
  setRotation,
  setStackNewcomers,
  startSession,
  stopSession,
  type SetFormatInput,
  type SetResultEntryInput,
  type SetRotationInput,
  type SetStackNewcomersInput,
} from "@/lib/mutations/settings";

export const useSetFormat = () => useSessionMutation<SetFormatInput>(setFormat);
export const useStartSession = () => useSessionMutation<void>(startSession);
export const useStopSession = () => useSessionMutation<void>(stopSession);
export const useSetResultEntry = () => useSessionMutation<SetResultEntryInput>(setResultEntry);
export const useSetRotation = () => useSessionMutation<SetRotationInput>(setRotation);
export const useSetStackNewcomers = () => useSessionMutation<SetStackNewcomersInput>(setStackNewcomers);
