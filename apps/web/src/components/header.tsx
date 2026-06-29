import { Link } from "@tanstack/react-router";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/upload", label: "Create" },
    { to: "/records", label: "Records" },
    { to: "/tamper", label: "Tamper" },
    { to: "/verify", label: "Verify" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-base">
          {links.map(({ to, label }) => (
            <Link
              activeProps={{ className: "font-semibold underline" }}
              key={to}
              to={to}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
