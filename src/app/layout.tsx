import type { Metadata } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { SiteNavigationProvider } from "@/components/site-navigation-provider";
import { isTicketingEnabled } from "@/modules/ticketing/policy";
import "./globals.css";
import "@/components/site-header.css";
export const metadata: Metadata = {
  title: "Hackathon — 为创造者而建",
  description: "黑客松活动平台 · A platform for people who create",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <SiteNavigationProvider ticketingEnabled={isTicketingEnabled()}>
          <LanguageProvider>{children}</LanguageProvider>
        </SiteNavigationProvider>
      </body>
    </html>
  );
}
