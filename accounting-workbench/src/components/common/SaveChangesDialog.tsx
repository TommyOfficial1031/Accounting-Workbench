import ConfirmDialog from "./ConfirmDialog";
import type { SavePrompt } from "../../stores/useSaveGuard";

interface SaveChangesDialogProps {
  prompt: SavePrompt | null;
  onSave: (onProceed: () => void) => void;
  onDiscard: (onProceed: () => void) => void;
  onClose: () => void;
}

function SaveChangesDialog({ prompt, onSave, onDiscard, onClose }: SaveChangesDialogProps) {
  if (prompt === null) return null;
  return (
    <ConfirmDialog
      title="未保存的修改"
      message="当前项目有未保存的修改，是否保存后继续？"
      onClose={onClose}
      actions={[
        { label: "取消", variant: "default", onClick: onClose },
        { label: "放弃修改", variant: "default", onClick: () => onDiscard(prompt.onProceed) },
        { label: "保存并继续", variant: "primary", onClick: () => onSave(prompt.onProceed) },
      ]}
    />
  );
}

export default SaveChangesDialog;
