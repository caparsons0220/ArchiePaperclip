import { Link } from "@/lib/router";
import { LayoutDashboard, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OpenDashboardToolbarAction() {
  return (
    <Button asChild size="sm" variant="outline" className="rounded-full">
      <Link to="/dashboard">
        <LayoutDashboard className="mr-1.5 h-4 w-4" />
        Open Dashboard
      </Link>
    </Button>
  );
}

export function BackToChatToolbarAction() {
  return (
    <Button asChild size="sm" variant="outline" className="rounded-full">
      <Link to="/home">
        <MessageSquare className="mr-1.5 h-4 w-4" />
        Back to Chat
      </Link>
    </Button>
  );
}
