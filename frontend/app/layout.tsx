import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ParamInfoProvider } from "@/components/param-info";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { UIProvider } from "@/components/ui";
import "./globals.css";
import { Topbar } from "@/components/topbar";
import { AccessGate } from "@/components/access-gate";

export const metadata: Metadata = {
  title: "LoRA Studio",
  description: "Train LoRA Qwen-Image 2.1 & Anima sambil belajar",
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%238b5cf6'/><stop offset='1' stop-color='%23d946ef'/></linearGradient></defs><rect width='32' height='32' rx='9' fill='url(%23g)'/><text x='16' y='22' font-size='16' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'>L</text></svg>" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('adexe-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){}` }} /></head>
      <body className="font-sans antialiased">
        <UIProvider>
          <AccessGate>
          <ParamInfoProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="min-w-0 flex-1">
                <MobileNav />
                <Topbar />
                <main className="mx-auto w-full max-w-[1400px] px-4 py-7 md:px-8 md:py-9">{children}</main>
              </div>
            </div>
          </ParamInfoProvider>
          </AccessGate>
        </UIProvider>
      </body>
    </html>
  );
}
