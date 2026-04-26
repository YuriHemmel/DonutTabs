import {
  Coffee, Briefcase, Book, BookOpen, Code, Code2, Terminal,
  GitBranch, Globe, Home, Mail, MessageCircle, MessageSquare,
  Music, Image, Camera, Video, Film, Tv, Headphones,
  Laptop, Monitor, Smartphone, Server, Cloud, Database,
  Folder, FolderOpen, File, FileText,
  Heart, Star, Bookmark, Tag, Hash,
  Calendar, Clock, Bell, Settings, Cog, Wrench,
  Lock, Key, Shield, User, Users,
  ShoppingCart, ShoppingBag, CreditCard, DollarSign,
  TrendingUp, BarChart, PieChart, Activity, Zap,
  Flag, MapPin, Map, Compass,
  Plane, Car, Train, Truck, Bike,
  Gamepad2, Trophy, Award, Gift,
  Pizza, Utensils, Beer, Wine, Apple,
  Search, Pencil, Trash2, Plus, Check, X,
  Eye, Download, Upload, Share2, Link, ExternalLink,
  Sun, Moon, CloudRain, Umbrella, Lightbulb, Flame,
  Droplet, Leaf, TreePine, Mountain, Anchor, Rocket,
} from "lucide-react";
import type { ComponentType } from "react";

// Curated registry shared by IconPicker (renders the grid) and IconRenderer
// (resolves `lucide:Name` tokens at runtime). Named imports here let Rollup
// tree-shake unused Lucide components — `import * as Lucide` plus dynamic
// indexed access defeats tree-shaking and pulls the entire library (~1500
// icons) into the bundle.

export type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export const LUCIDE_REGISTRY: Readonly<Record<string, LucideIcon>> = {
  Coffee, Briefcase, Book, BookOpen, Code, Code2, Terminal,
  GitBranch, Globe, Home, Mail, MessageCircle, MessageSquare,
  Music, Image, Camera, Video, Film, Tv, Headphones,
  Laptop, Monitor, Smartphone, Server, Cloud, Database,
  Folder, FolderOpen, File, FileText,
  Heart, Star, Bookmark, Tag, Hash,
  Calendar, Clock, Bell, Settings, Cog, Wrench,
  Lock, Key, Shield, User, Users,
  ShoppingCart, ShoppingBag, CreditCard, DollarSign,
  TrendingUp, BarChart, PieChart, Activity, Zap,
  Flag, MapPin, Map, Compass,
  Plane, Car, Train, Truck, Bike,
  Gamepad2, Trophy, Award, Gift,
  Pizza, Utensils, Beer, Wine, Apple,
  Search, Pencil, Trash2, Plus, Check, X,
  Eye, Download, Upload, Share2, Link, ExternalLink,
  Sun, Moon, CloudRain, Umbrella, Lightbulb, Flame,
  Droplet, Leaf, TreePine, Mountain, Anchor, Rocket,
};

export const LUCIDE_NAMES: ReadonlyArray<string> = Object.keys(LUCIDE_REGISTRY);

export function getLucideComponent(name: string): LucideIcon | null {
  return LUCIDE_REGISTRY[name] ?? null;
}
