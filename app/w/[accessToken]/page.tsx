"use client";
import { useParams } from "next/navigation";
import WorkerDashboard from "@/components/WorkerDashboard";

export default function WorkerTokenPage() {
  const params = useParams();
  return <WorkerDashboard accessToken={params.accessToken as string} />;
}
