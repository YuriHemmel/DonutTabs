import React from "react";
import type { Profile } from "../core/types/Profile";
import { Slice } from "./Slice";
import { sliceAngleRange } from "./geometry";
import { useSliceHighlight } from "./useSliceHighlight";

export interface ProfileSwitcherProps {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  profiles: Profile[];
  activeProfileId: string;
  onSelect: (profileId: string) => void;
  /** Click na fatia "+" — cria novo perfil. */
  onCreate: () => void;
}

const PLUS_KEY = "__plus_profile__";

/**
 * Renderiza N+1 fatias: uma por perfil + "+" pra criar novo. Cada fatia mostra
 * `icon ?? primeira-letra-do-nome`. O perfil ativo recebe destaque visual.
 *
 * Diferente do Donut em modo abas, não há paginação nem hover-hold — o
 * switcher de perfis é simples e direto.
 */
export const ProfileSwitcher: React.FC<ProfileSwitcherProps> = ({
  cx,
  cy,
  innerR,
  outerR,
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
}) => {
  const total = profiles.length + 1;
  const plusIndex = profiles.length;

  const { highlighted, onMouseMove, onMouseLeave } = useSliceHighlight({
    center: { x: cx, y: cy },
    slices: total,
    innerRadius: innerR,
    outerRadius: outerR,
  });

  return (
    <g
      data-testid="profile-switcher"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {profiles.map((profile, i) => {
        const { start, end } = sliceAngleRange(i, total);
        const label = profile.name;
        const fallbackInitial =
          profile.name.trim().charAt(0).toUpperCase() || "?";
        const icon = profile.icon ?? fallbackInitial;
        const isActive = profile.id === activeProfileId;
        return (
          <g key={profile.id}>
            <Slice
              cx={cx}
              cy={cy}
              innerR={innerR}
              outerR={outerR}
              startAngle={start}
              endAngle={end}
              label={label}
              icon={icon}
              highlighted={highlighted === i}
              onClick={() => onSelect(profile.id)}
            />
            {isActive && (
              <ActiveMarker
                cx={cx}
                cy={cy}
                innerR={innerR}
                outerR={outerR}
                startAngle={start}
                endAngle={end}
              />
            )}
          </g>
        );
      })}
      {(() => {
        const { start, end } = sliceAngleRange(plusIndex, total);
        return (
          <Slice
            key={PLUS_KEY}
            cx={cx}
            cy={cy}
            innerR={innerR}
            outerR={outerR}
            startAngle={start}
            endAngle={end}
            icon="+"
            highlighted={highlighted === plusIndex}
            onClick={onCreate}
          />
        );
      })()}
    </g>
  );
};

interface ActiveMarkerProps {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Pequena marca dourada na borda externa da fatia para destacar o perfil
 * ativo no switcher.
 */
const ActiveMarker: React.FC<ActiveMarkerProps> = ({
  cx,
  cy,
  innerR: _innerR,
  outerR,
  startAngle,
  endAngle,
}) => {
  const mid = (startAngle + endAngle) / 2;
  const x = cx + (outerR - 8) * Math.cos(mid);
  const y = cy + (outerR - 8) * Math.sin(mid);
  return (
    <circle
      data-testid="active-profile-marker"
      cx={x}
      cy={y}
      r={4}
      fill="#e7b94c"
      pointerEvents="none"
    />
  );
};
