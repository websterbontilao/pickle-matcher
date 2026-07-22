import { useSessionMutation } from "@/lib/query/createSessionMutation";
import { setFormat, startSession, stopSession, type SetFormatInput } from "@/lib/mutations/settings";

export const useSetFormat = () => useSessionMutation<SetFormatInput>(setFormat);
export const useStartSession = () => useSessionMutation<void>(startSession);
export const useStopSession = () => useSessionMutation<void>(stopSession);
