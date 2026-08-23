import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { PluginDraftContent } from "@wrapt/contracts";
import { PluginPreview } from "../components/plugins/PluginPreview";
import { wraptQueries } from "../lib/queryOptions";
import { findActivePluginContent } from "../extensions/pluginRuntime";

interface PluginRuntimeProps {
  pluginSlug?: string;
}

export function PluginRuntime({ pluginSlug }: PluginRuntimeProps = {}) {
  const params = useParams();
  const slug = pluginSlug ?? params.pluginSlug;
  const drafts = useQuery(wraptQueries.pluginDrafts());
  const examples = useQuery(wraptQueries.pluginExamples());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const runtime = useMemo(() => findActivePluginContent(
    slug,
    drafts.data?.drafts ?? [],
    examples.data?.examples ?? [],
    registry.data?.extensions ?? [],
  ), [slug, drafts.data?.drafts, examples.data?.examples, registry.data?.extensions]);
  const content: PluginDraftContent | undefined = runtime?.content;

  if (!content) return <div className="page-scroll"><div className="page-frame plugins-page"><div className="plugins-empty"><strong>Plugin nicht gefunden</strong><span>Das Plugin ist nicht installiert oder nicht aktiv.</span></div></div></div>;
  return <div className="page-scroll"><div className="page-frame plugins-page plugins-runtime-page"><header className="plugins-runtime-heading"><span className="plugins-kicker">Werkzeugseite</span><h1>{content.name}</h1><p>{content.description}</p></header><PluginPreview draft={content} /></div></div>;
}

export function createPluginToolPage(slug: string) {
  return function PluginToolPage() {
    return <PluginRuntime pluginSlug={slug} />;
  };
}
