import type { TimeEntryDto } from "@verilio/contracts";
import { Button, Dialog, DialogClose, InlineError } from "@verilio/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteTimeEntry, timeEntryKeys } from "./time-entry-api.js";
import { formatDuration } from "./time-format.js";

export function DeleteTimeEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: TimeEntryDto;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteTimeEntry(entry.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timeEntryKeys.all });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Delete time entry?"
      description={`Delete ${formatDuration(entry.durationSeconds)} — “${entry.description}”? This cannot be undone.`}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Deleting…" : "Delete permanently"}
          </Button>
        </>
      }
    >
      {mutation.isError ? (
        <InlineError>
          {mutation.error instanceof Error
            ? mutation.error.message
            : "Time entry could not be deleted."}
        </InlineError>
      ) : null}
    </Dialog>
  );
}
