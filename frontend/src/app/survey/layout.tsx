import type { Metadata } from "next";

// The survey is shared by link with farmers. Keep it, and its results, out of search engines.
export const metadata: Metadata = {
  title: "FarmAs farmer survey",
  description: "Help Team Imperials build a better app for livestock farmers. It takes about 10 minutes.",
  robots: { index: false, follow: false },
};

export default function SurveyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
