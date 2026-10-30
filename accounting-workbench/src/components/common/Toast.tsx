import { useEffect } from "react";
import styles from "./Toast.module.css";

interface ToastProps {
  message: string;
  onClose: () => void;
}

function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  );
}

export default Toast;
