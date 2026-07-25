import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from '@/components/app-sidebar';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'FeedHub Admin',
  description: 'Endpoint feed management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-(--font-inter)">
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <main className="flex flex-col flex-1 min-h-screen">
              <header className="flex items-center justify-between px-4 py-2.5 border-b bg-background sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <SidebarTrigger />
                  <span className="text-sm font-semibold text-foreground">FeedHub Admin</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <Bell className="h-4 w-4" />
                  </Button>
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold ml-1 shrink-0">
                    A
                  </div>
                </div>
              </header>
              <div className="flex-1 p-6">{children}</div>
            </main>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
