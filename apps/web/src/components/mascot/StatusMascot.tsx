import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { wraptQueries } from "../../lib/queryOptions";
import { RefreshIcon } from "../icons";
import { isDynamicImportFailure } from "../../lib/routeModules";
import type { StatusMascotCreature } from "./StatusMascotCreature";

type Creature = typeof StatusMascotCreature;
let loading: Promise<Creature> | undefined;

function loadCreature(): Promise<Creature> {
  if (!loading) loading = import("./StatusMascotCreature").then(async (module) => {
    await module.prepareStatusMascot();
    return module.StatusMascotCreature;
  }).catch((error: unknown) => { loading = undefined; throw error; });
  return loading;
}

/** Die Konfiguration bleibt klein; deaktivierte Maskottchen laden keine Sprites. */
export function StatusMascot() {
  const mascot = useQuery(wraptQueries.mascot());
  const enabled = mascot.data?.mascot.enabled === true;
  const [Creature, setCreature] = useState<Creature | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || Creature) return;
    let active = true;
    setFailed(false);
    setReloadRequired(false);
    void loadCreature().then((loaded) => { if (active) setCreature(() => loaded); })
      .catch((error: unknown) => { if (active) { setFailed(true); setReloadRequired(isDynamicImportFailure(error)); } });
    return () => { active = false; };
  }, [enabled, Creature, retry]);
  if (!enabled) return null;
  if (Creature) return <Creature scale={mascot.data!.mascot.scale} />;
  return <div className="status-mascot" aria-busy={!failed}>
    <div className="status-mascot-stage">
      {failed ? <button type="button" className="quiet-button min-h-11 min-w-11"
        aria-label={reloadRequired ? "Workbench neu laden" : "Maskottchen erneut laden"}
        title={reloadRequired ? "Workbench neu laden" : "Maskottchen erneut laden"}
        onClick={() => { if (reloadRequired) window.location.reload(); else setRetry((value) => value + 1); }}><RefreshIcon className="h-4 w-4" /></button> : null}
    </div>
  </div>;
}
