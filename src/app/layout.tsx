import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavWrapper } from "@/components/NavWrapper";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stellar Quick Comments",
  description: "Comment overlay demo for any webpage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased dark`}
    >
      <body className="h-full bg-[#0A0A0F] text-white">
        <TooltipProvider>
          <NavWrapper>
            {children}
          </NavWrapper>
        </TooltipProvider>
      </body>
    </html>
  );
}
