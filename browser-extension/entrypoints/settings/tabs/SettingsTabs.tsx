export type SettingsTab = "priorities" | "profiles" | "driving" | "searches" | "ai" | "data";

export const isSettingsTab = (value: string): value is SettingsTab =>
    ["priorities", "profiles", "driving", "searches", "ai", "data"].includes(value);

const TABS: { id: SettingsTab; label: string }[] = [
    { id: "priorities", label: "Priorities" },
    { id: "profiles", label: "Profiles" },
    { id: "driving", label: "Driving" },
    { id: "searches", label: "Searches" },
    { id: "ai", label: "Lens AI" },
    { id: "data", label: "Data" },
];

export function SettingsTabs({ active, onChange, badges }: { active: SettingsTab; onChange: (tab: SettingsTab) => void; badges?: Partial<Record<SettingsTab, number>> }) {
    return (
        <div className="flex items-center gap-1.5 rounded-full bg-white p-1 shadow-sm">
            {TABS.map((tab) => {
                const count = badges?.[tab.id] ?? 0;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`relative whitespace-nowrap rounded-full px-4 py-2 w-full max-w-28 text-xs font-bold transition ${active === tab.id ? "bg-finn-accent-blue text-white" : "text-finn-iron hover:text-finn-black"}`}
                    >
                        {tab.label}
                        {count > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-finn-error text-[9px] font-black text-white">{count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}