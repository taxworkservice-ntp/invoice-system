import { ImageUpload } from "./ImageUpload";
import { logoKey } from "../../lib/r2";

interface LogoUploadProps {
  userId: string;
  currentLogoKey: string | null;
  onLogoChange: (key: string | null) => void;
}

export function LogoUpload({ userId, currentLogoKey, onLogoChange }: LogoUploadProps) {
  return (
    <ImageUpload
      userId={userId}
      storageKeyFn={logoKey}
      currentKey={currentLogoKey}
      onKeyChange={onLogoChange}
      label="โลโก้บริษัท"
      placeholder="โลโก้"
    />
  );
}