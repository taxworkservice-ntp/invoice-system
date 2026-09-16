import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ImpersonationBannerProps {
  clientName: string;
  onStop: () => void;
  returnTo: string;
}

export function ImpersonationBanner({ clientName, onStop, returnTo }: ImpersonationBannerProps) {
  const navigate = useNavigate();

  function handleStop() {
    onStop();
    navigate(returnTo, { replace: true });
  }

  return (
    <div className="bg-pending-bg border-b border-warning-border text-pending-text px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={handleStop}
          className="flex items-center gap-1 text-pending-text font-medium text-body hover:underline shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          หยุดดูในฐานะลูกค้า
        </button>
      </div>
      <span className="text-body text-pending-text/80 truncate ml-2">
        กำลังดูในฐานะ: <strong>{clientName}</strong>
      </span>
    </div>
  );
}
