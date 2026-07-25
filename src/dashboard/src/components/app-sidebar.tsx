'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, Settings } from 'lucide-react';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

const navItems = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard },
    { title: 'Endpoints', href: '/endpoints', icon: Database },
];

export function AppSidebar() {
    const pathname = usePathname();

    return (
        <Sidebar>
            <SidebarHeader className="px-4 py-4">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-sidebar-foreground/15 flex items-center justify-center shrink-0">
                        <Database className="h-4 w-4 text-sidebar-foreground" />
                    </div>
                    <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
                        FeedHub Admin
                    </span>
                </Link>
            </SidebarHeader>
            <Separator className="opacity-20" />
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton
                                        render={<Link href={item.href} />}
                                        isActive={
                                            item.href === '/'
                                                ? pathname === '/'
                                                : pathname.startsWith(item.href)
                                        }
                                        className="flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground"
                                    >
                                        <item.icon className="h-4 w-4 shrink-0" />
                                        <span>{item.title}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <Separator className="opacity-20" />
            <SidebarFooter className="p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            render={<Link href="/settings" />}
                            className="flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground"
                        >
                            <Settings className="h-4 w-4 shrink-0" />
                            <span>Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
