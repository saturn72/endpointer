'use client';

import { useState } from 'react';
import { createEndpoint } from '@/actions/endpoints';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

export function NewEndpointSheet() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Endpoint
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-80 p-0 flex flex-col">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b">
                        <SheetTitle className="text-base font-semibold">New Endpoint</SheetTitle>
                    </SheetHeader>
                    <form action={createEndpoint} className="flex flex-col flex-1 px-6 py-5 gap-5">
                        <div className="space-y-2">
                            <Label htmlFor="sheet-name" className="text-sm font-medium">
                                Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="sheet-name"
                                name="name"
                                required
                                placeholder="my-endpoint"
                                pattern="[a-zA-Z0-9_\-]+"
                                title="Letters, numbers, dashes, and underscores only"
                                className="text-sm"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sheet-id-field" className="text-sm font-medium">
                                ID Field{' '}
                                <span className="text-muted-foreground font-normal">(optional)</span>
                            </Label>
                            <p className="text-xs text-muted-foreground -mt-1">
                                Specify a unique identifier field for updates.
                            </p>
                            <Input
                                id="sheet-id-field"
                                name="id_field"
                                placeholder="id"
                                className="text-sm"
                            />
                        </div>
                        <div className="flex gap-2 mt-auto">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" className="flex-1">
                                Create
                            </Button>
                        </div>
                    </form>
                </SheetContent>
            </Sheet>
        </>
    );
}
