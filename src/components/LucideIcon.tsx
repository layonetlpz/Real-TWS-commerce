import {
  Award,
  BarChart3,
  Boxes,
  Calculator,
  FileSearch,
  FileSpreadsheet,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageSquareHeart,
  Package,
  PackageCheck,
  Palette,
  Receipt,
  Settings,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Truck,
  UserCheck,
  Users,
  Workflow,
  type LucideProps
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  LayoutDashboard,
  Package,
  Boxes,
  Truck,
  Calculator,
  Tag,
  Receipt,
  Users,
  Landmark,
  ShoppingBag,
  UserCheck,
  MessageSquareHeart,
  PackageCheck,
  Award,
  Sparkles,
  Palette,
  Store,
  Share2,
  MessageCircle,
  Megaphone,
  Workflow,
  BarChart3,
  Settings,
  ShieldCheck,
  FileSearch,
  FileSpreadsheet
};

interface LucideIconProps extends LucideProps {
  name: string;
}

export function LucideIcon({ name, size = 18, ...props }: LucideIconProps) {
  const IconComponent = ICON_MAP[name] ?? LayoutDashboard;
  return <IconComponent size={size} {...props} />;
}
