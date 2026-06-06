import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  action?: React.ReactNode;
}

export function TopBar({ title, showBack, action }: TopBarProps) {
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-card-border bg-white/90 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 h-14 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              aria-label="ย้อนกลับ"
              className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => setLogoutOpen(true)}
            aria-label="ออกจากระบบ"
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>

      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="ออกจากระบบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            คุณแน่ใจว่าต้องการออกจากระบบใช่หรือไม่?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={handleLogout}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  );
}
