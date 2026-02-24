import { FiAlertTriangle, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  type = 'warning', // warning, danger, success
  loading = false
}) => {
  if (!isOpen) return null;

  const icons = {
    warning: <FiAlertCircle />,
    danger: <FiAlertTriangle />,
    success: <FiCheckCircle />
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-modal-icon ${type}`}>
          {icons[type]}
        </div>
        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>
        <div className="modal-footer">
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button 
            className={`btn ${type === 'danger' ? 'btn-danger' : type === 'success' ? 'btn-success' : 'btn-warning'} ${loading ? 'btn-loading' : ''}`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
