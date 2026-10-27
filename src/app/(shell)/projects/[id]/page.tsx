"use client";
import { use } from "react";
import EditorPage from "@/components/editor/EditorPage";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EditorPage key={id} projectId={id} />;
}
