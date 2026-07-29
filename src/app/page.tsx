import { BenchmarkDashboard } from "@/components/benchmark-dashboard";

export default function Home() {
  return (
    <BenchmarkDashboard
      githubUrl={process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL?.trim() ?? ""}
    />
  );
}
