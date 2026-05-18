import { Card, CardContent } from "./ui/card";

export default function StatCard({ icon: Icon, label, value }) {
    return (
        <Card className="rounded-2xl shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-muted p-3">
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold tracking-tight">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}