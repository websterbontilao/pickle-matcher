import { CourtList } from "@/components/setup/CourtList";
import { FormatToggle } from "@/components/setup/FormatToggle";
import { ResultEntryToggle } from "@/components/setup/ResultEntryToggle";
import { RotationToggle } from "@/components/setup/RotationToggle";

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl divide-y">
      <div className="px-3 py-2">
        <h1 className="text-sm font-semibold">Setup</h1>
      </div>
      <FormatToggle />
      <RotationToggle />
      <ResultEntryToggle />
      <CourtList />
    </div>
  );
}
