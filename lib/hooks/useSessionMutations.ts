import { useSessionMutation } from "@/lib/query/createSessionMutation";
import { resetSession } from "@/lib/mutations/session";

export const useResetSession = () => useSessionMutation<void>(resetSession);
