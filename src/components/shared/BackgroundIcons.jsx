import {
  CandlestickChart, BarChart3, LineChart, PieChart,
  ArrowUpRight, ArrowDownRight, DollarSign, Percent,
  Target, Activity, Wallet, Coins,
} from 'lucide-react';

const BG_ICONS = [
  { Icon: CandlestickChart, top: '8%', left: '8%', size: 32, rotate: -15 },
  { Icon: BarChart3, top: '15%', right: '12%', size: 28, rotate: 10 },
  { Icon: LineChart, top: '35%', left: '5%', size: 24, rotate: -25 },
  { Icon: ArrowUpRight, top: '25%', right: '6%', size: 20, rotate: 20 },
  { Icon: DollarSign, bottom: '30%', left: '10%', size: 26, rotate: 15 },
  { Icon: ArrowDownRight, bottom: '20%', right: '8%', size: 22, rotate: -10 },
  { Icon: PieChart, bottom: '12%', left: '15%', size: 30, rotate: 25 },
  { Icon: Percent, top: '50%', right: '4%', size: 18, rotate: -20 },
  { Icon: Target, bottom: '40%', right: '15%', size: 24, rotate: 5 },
  { Icon: Activity, top: '60%', left: '4%', size: 22, rotate: -30 },
  { Icon: Wallet, top: '5%', left: '45%', size: 20, rotate: 12 },
  { Icon: Coins, bottom: '8%', right: '40%', size: 24, rotate: -8 },
];

export default function BackgroundIcons() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {BG_ICONS.map(({ Icon, size, rotate, ...pos }, i) => (
        <Icon
          key={i}
          className="absolute text-accent-primary"
          style={{
            ...pos,
            width: size,
            height: size,
            opacity: 0.18,
            transform: `rotate(${rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
