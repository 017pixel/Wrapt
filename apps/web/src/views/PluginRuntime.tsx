import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { PluginDraftContent } from "@wrapt/contracts";
import { PluginPreview } from "../components/plugins/PluginPreview";
import { wraptQueries } from "../lib/queryOptions";

interface PluginRuntimeProps {
  pluginSlug?: string;
}

export function PluginRuntime({ pluginSlug }: PluginRuntimeProps = {}) {
  const params = useParams();
  const slug = pluginSlug ?? params.pluginSlug;
  const runtimes = useQuery(wraptQueries.extensionRuntimes());
  const content: PluginDraftContent | undefined = useMemo(
    () => runtimes.data?.runtimes.find((item) => item.content.slug === slug)?.content,
    [runtimes.data?.runtimes, slug],
  );

  if (!content) return <div className="page-scroll"><div className="page-frame plugins-page"><div className="plugins-empty"><strong>Plugin nicht gefunden</strong><span>Das Plugin ist nicht installiert oder nicht aktiv.</span></div></div></div>;
  return <div className="page-scroll"><div className="page-frame plugins-page plugins-runtime-page"><header className="plugins-runtime-heading"><span className="plugins-kicker">Werkzeugseite</span><h1>{content.name}</h1><p>{content.description}</p></header><PluginPreview draft={content} /></div></div>;
}

export function createPluginToolPage(slug: string) {
  return function PluginToolPage() {
    return <PluginRuntime pluginSlug={slug} />;
  };
}
