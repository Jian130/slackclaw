import type { CSSProperties } from "react";
import type { MemberAvatar as MemberAvatarShape } from "@chillclaw/contracts";

import { memberAvatarEmoji, memberAvatarImageSrc } from "../avatar-presets.js";

export function memberInitials(name: string | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AI";
}

interface MemberAvatarProps {
  avatar?: MemberAvatarShape;
  name?: string;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}

export function MemberAvatar(props: MemberAvatarProps) {
  const imageSrc = memberAvatarImageSrc(props.avatar);
  const fallback = props.avatar?.emoji || memberAvatarEmoji(props.avatar) || memberInitials(props.name);

  return (
    <div
      className={props.className}
      style={props.style}
      aria-label={props.alt ?? props.name ?? "AI member avatar"}
      title={props.name}
    >
      {imageSrc ? (
        <img
          alt={props.alt ?? props.name ?? "AI member avatar"}
          className="member-avatar-image"
          src={imageSrc}
        />
      ) : (
        <span className="member-avatar-fallback">{fallback}</span>
      )}
    </div>
  );
}
