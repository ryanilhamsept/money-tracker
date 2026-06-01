import { Card, CardContent } from "./ui/card";

export default function StatCard({ icon: Icon, label, value }) {
    return (
        <Card className="h-full rounded-[1.75rem] border-white/70 bg-white/85 shadow-xl backdrop-blur">
            <CardContent className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 rounded-3xl bg-slate-100 p-4">
                    <Icon className="h-8 w-8 text-slate-700" />
                </div>

                <p className="text-lg font-semibold text-slate-500">
                    {label}
                </p>

                <p className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}