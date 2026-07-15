import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { defaultPlayer, defaultSettings } from '../domain/defaults';
import { CareerSettings, PlayerBuild } from '../domain/models';

interface NewCareerCtx {
  player: PlayerBuild;
  setPlayer: (p: PlayerBuild | ((prev: PlayerBuild) => PlayerBuild)) => void;
  settings: CareerSettings;
  setSettings: (s: CareerSettings | ((prev: CareerSettings) => CareerSettings)) => void;
  reset: () => void;
}

const Ctx = createContext<NewCareerCtx | null>(null);

export function NewCareerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState(() => defaultPlayer());
  const [settings, setSettings] = useState(() => defaultSettings());
  const value = useMemo(
    () => ({
      player,
      setPlayer,
      settings,
      setSettings,
      reset: () => {
        setPlayer(defaultPlayer());
        setSettings(defaultSettings());
      },
    }),
    [player, settings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNewCareer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNewCareer outside provider');
  return ctx;
}
