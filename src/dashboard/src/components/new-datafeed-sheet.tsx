'use client';

import { useEffect, useState } from 'react';
import { createDatafeed, datafeedNameExists } from '@/actions/datafeeds';
import { endpointNameExists } from '@/actions/endpoints';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const SAFE = /^[a-zA-Z0-9_-]+$/;
const validName = (v: string) => SAFE.test(v) && v.length <= 100;

// Debounced "is this name taken" check; null while idle or when the name is invalid.
function useTaken(name: string, check: (n: string) => Promise<boolean | null>, enabled: boolean) {
    const [taken, setTaken] = useState(false);
    const [checking, setChecking] = useState(false);
    const active = enabled && validName(name);

    useEffect(() => {
        setTaken(false);
        if (!active) {
            setChecking(false);
            return;
        }
        setChecking(true);
        let cancelled = false;
        const timer = setTimeout(async () => {
            const result = await check(name);
            if (cancelled) return;
            setTaken(result === true);
            setChecking(false);
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [name, active, check]);

    return { taken, checking };
}

export function NewDatafeedSheet() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [idField, setIdField] = useState('');
    const [createEndpoint, setCreateEndpoint] = useState(true);
    const [endpointName, setEndpointName] = useState('');

    // The endpoint name follows the datafeed name until the user types one.
    const effectiveEndpointName = endpointName || name;

    const df = useTaken(name, datafeedNameExists, true);
    const ep = useTaken(effectiveEndpointName, endpointNameExists, createEndpoint);

    const idFieldValid = idField === '' || SAFE.test(idField);
    const endpointValid = !createEndpoint || (validName(effectiveEndpointName) && !ep.taken);
    const canCreate = validName(name) && !df.taken && !df.checking && idFieldValid && endpointValid && !ep.checking;

    return (
        <>
            <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Datafeed
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent side="right" className="w-96 p-0 flex flex-col overflow-y-auto">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b">
                        <SheetTitle className="text-base font-semibold">New Datafeed</SheetTitle>
                    </SheetHeader>
                    <form action={createDatafeed} className="flex flex-col flex-1 px-6 py-5 gap-5">
                        <p className="text-xs text-muted-foreground">
                            A datafeed is a source of data. An adapter reads it (for example a file you upload) and
                            converts it to JSON. Every upload creates a new version. To serve the data online, connect
                            it to an endpoint.
                        </p>

                        <div className="space-y-2">
                            <Label htmlFor="df-name" className="text-sm font-medium">
                                Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="df-name"
                                name="name"
                                required
                                placeholder="store-catalog"
                                pattern="[a-zA-Z0-9_\-]+"
                                title="Letters, numbers, dashes, and underscores only"
                                className="text-sm"
                                autoFocus
                                value={name}
                                onChange={(e) => setName(e.target.value.trim())}
                                aria-invalid={df.taken}
                            />
                            {df.taken && (
                                <p className="text-xs text-destructive" role="alert">
                                    A datafeed with that name already exists
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="df-adapter" className="text-sm font-medium">
                                Adapter
                            </Label>
                            <Input id="df-adapter" value="Static file" disabled className="text-sm" />
                            <p className="text-xs text-muted-foreground">
                                Converts an uploaded CSV, XLSX, XLS or XML file. Scheduled downloads and database
                                adapters are coming later.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="df-id-field" className="text-sm font-medium">
                                ID Field <span className="text-muted-foreground font-normal">(optional)</span>
                            </Label>
                            <Input
                                id="df-id-field"
                                name="id_field"
                                placeholder="id"
                                className="text-sm"
                                value={idField}
                                onChange={(e) => setIdField(e.target.value.trim())}
                                aria-invalid={!idFieldValid}
                            />
                            <p className="text-xs text-muted-foreground">
                                The column that uniquely identifies a record. It enables fetching a single record by
                                its value, and uploads without this column are rejected.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="df-description" className="text-sm font-medium">
                                Description <span className="text-muted-foreground font-normal">(optional)</span>
                            </Label>
                            <Input id="df-description" name="description" maxLength={500} className="text-sm" />
                        </div>

                        <div className="space-y-3 rounded-lg border border-border p-3">
                            <label className="flex items-start gap-2 text-sm font-medium cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="create_endpoint"
                                    checked={createEndpoint}
                                    onChange={(e) => setCreateEndpoint(e.target.checked)}
                                    className="mt-0.5 h-4 w-4"
                                />
                                <span>
                                    Also create an endpoint
                                    <span className="block text-xs font-normal text-muted-foreground">
                                        An endpoint is the public URL that serves this datafeed&apos;s latest version.
                                    </span>
                                </span>
                            </label>
                            {createEndpoint && (
                                <div className="space-y-2">
                                    <Label htmlFor="df-endpoint-name" className="text-sm font-medium">
                                        Endpoint name
                                    </Label>
                                    <Input
                                        id="df-endpoint-name"
                                        name="endpoint_name"
                                        placeholder={name || 'my-endpoint'}
                                        className="text-sm"
                                        value={endpointName}
                                        onChange={(e) => setEndpointName(e.target.value.trim())}
                                        aria-invalid={ep.taken || (effectiveEndpointName !== '' && !validName(effectiveEndpointName))}
                                    />
                                    {ep.taken && (
                                        <p className="text-xs text-destructive" role="alert">
                                            An endpoint with that name already exists
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 mt-auto">
                            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" className="flex-1" disabled={!canCreate}>
                                Create
                            </Button>
                        </div>
                    </form>
                </SheetContent>
            </Sheet>
        </>
    );
}
