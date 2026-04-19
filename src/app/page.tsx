import { getDashboardData } from "@/lib/dashboard";
import HomePageClient from "@/components/home-page-client";

export default async function HomePage() {
  const data = await getDashboardData();
  return <HomePageClient data={data} />;
}
