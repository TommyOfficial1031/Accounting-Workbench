import Modal from "./Modal";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmAction {
  label: string;
  variant: "primary" | "danger" | "default";
  onClick: () => void;
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  actions: ConfirmAction[];
  onClose: () => void;
}

function ConfirmDialog({ title, message, actions, onClose }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`${styles.button} ${styles[action.variant]}`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
