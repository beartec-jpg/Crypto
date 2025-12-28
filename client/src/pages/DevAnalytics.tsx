import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Users, Activity, DollarSign, Clock, TrendingUp, Zap, Eye, MousePointer, PieChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, LineChart, Line } from 'recharts';
import { useLocation } from 'wouter';
import { Helmet } from 'react-helmet-async';

const COLORS = ['#00c4b4', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#6366f1', '#ec4899'];

export default function DevAnalytics() {
  const [, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState('7d');
  
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['/api/analytics/dashboard', timeRange],
    refetchInterval: 30000,
  });
  
  const { data: realtime } = useQuery({
    queryKey: ['/api/analytics/realtime'],
    refetchInterval: 10000,
  });
  
  const { data: topFeatures } = useQuery({
    queryKey: ['/api/analytics/top', 'features'],
  });
  
  const { data: topPages } = useQuery({
    queryKey: ['/api/analytics/top', 'pages'],
  });
  
  const { data: topSymbols } = useQuery({
    queryKey: ['/api/analytics/top', 'symbols'],
  });
  
  const { data: topClicks } = useQuery({
    queryKey: ['/api/analytics/top', 'clicks'],
  });
  
  const { data: apiCosts } = useQuery({
    queryKey: ['/api/analytics/api-costs', timeRange],
  });
  
  if (dashboard?.error === 'Dev access only') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-red-500 p-8">
          <CardTitle className="text-red-400 text-xl mb-4">Access Denied</CardTitle>
          <p className="text-gray-400">This page is only accessible to developers.</p>
          <Button onClick={() => setLocation('/crypto/indicators')} className="mt-4">
            Return to App
          </Button>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      <Helmet>
        <title>Developer Analytics | BearTec</title>
      </Helmet>
      
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#00c4b4] flex items-center gap-2">
              <BarChart3 className="w-8 h-8" />
              Developer Analytics Dashboard
            </h1>
            <p className="text-gray-400 mt-1">Real-time usage and cost tracking</p>
          </div>
          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32 bg-slate-800 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button className="bg-slate-700 text-white hover:bg-slate-600 border border-slate-600" onClick={() => setLocation('/crypto/indicators')}>
              Back to App
            </Button>
          </div>
        </div>
        
        {realtime && (
          <Card className="bg-gradient-to-r from-[#00c4b4]/20 to-blue-500/20 border-[#00c4b4]/50 mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-300">Live</span>
                </div>
                <div className="flex gap-8">
                  <div>
                    <span className="text-gray-400 text-sm">Last Hour Events:</span>
                    <span className="ml-2 text-xl font-bold text-white">{realtime.lastHour?.events || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Active Sessions:</span>
                    <span className="ml-2 text-xl font-bold text-[#00c4b4]">{realtime.lastHour?.activeSessions || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">24h Events:</span>
                    <span className="ml-2 text-xl font-bold text-white">{realtime.last24Hours?.events || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Page Views</p>
                  <p className="text-3xl font-bold text-white">{dashboard?.totalPageViews || 0}</p>
                </div>
                <Eye className="w-10 h-10 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Unique Users</p>
                  <p className="text-3xl font-bold text-[#00c4b4]">{dashboard?.uniqueUsers || 0}</p>
                </div>
                <Users className="w-10 h-10 text-[#00c4b4]" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Registered</p>
                  <p className="text-3xl font-bold text-purple-400">{dashboard?.totalRegisteredUsers || 0}</p>
                </div>
                <TrendingUp className="w-10 h-10 text-purple-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">API Calls</p>
                  <p className="text-3xl font-bold text-amber-400">{dashboard?.totalApiCalls || 0}</p>
                </div>
                <Zap className="w-10 h-10 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">AI Analysis Calls</p>
                  <p className="text-2xl font-bold text-white">{dashboard?.totalAiCalls || 0}</p>
                </div>
                <Activity className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">AI Tokens Used</p>
                  <p className="text-2xl font-bold text-white">{(dashboard?.totalAiTokens || 0).toLocaleString()}</p>
                </div>
                <Clock className="w-8 h-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-800 border-slate-700 border-green-500/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Estimated AI Cost</p>
                  <p className="text-2xl font-bold text-green-400">${(dashboard?.estimatedAiCost || 0).toFixed(4)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Tabs defaultValue="features" className="space-y-4">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="features" className="data-[state=active]:bg-[#00c4b4]">Top Features</TabsTrigger>
            <TabsTrigger value="pages" className="data-[state=active]:bg-[#00c4b4]">Top Pages</TabsTrigger>
            <TabsTrigger value="symbols" className="data-[state=active]:bg-[#00c4b4]">Top Symbols</TabsTrigger>
            <TabsTrigger value="clicks" className="data-[state=active]:bg-[#00c4b4]">Top Clicks</TabsTrigger>
            <TabsTrigger value="costs" className="data-[state=active]:bg-[#00c4b4]">API Costs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="features">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MousePointer className="w-5 h-5" />
                  Most Used Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topFeatures && topFeatures.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topFeatures}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                      <Bar dataKey="count" fill="#00c4b4" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-400 text-center py-8">No feature usage data yet. Start using the app to see analytics!</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="pages">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Most Visited Pages
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topPages && topPages.length > 0 ? (
                  <div className="flex gap-8">
                    <ResponsiveContainer width="50%" height={300}>
                      <RechartsPie>
                        <Pie
                          data={topPages}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {topPages.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                    <div className="flex-1">
                      <table className="w-full">
                        <thead>
                          <tr className="text-gray-400 text-sm">
                            <th className="text-left py-2">Page</th>
                            <th className="text-right py-2">Views</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topPages.map((page: any, idx: number) => (
                            <tr key={idx} className="border-t border-slate-700">
                              <td className="py-2 text-white">{page.name || '(unknown)'}</td>
                              <td className="py-2 text-right text-[#00c4b4] font-bold">{page.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No page view data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="symbols">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <PieChart className="w-5 h-5" />
                  Most Popular Trading Pairs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topSymbols && topSymbols.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topSymbols} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis type="number" stroke="#9ca3af" />
                      <YAxis dataKey="name" type="category" stroke="#9ca3af" width={100} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-400 text-center py-8">No symbol usage data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="clicks">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MousePointer className="w-5 h-5" />
                  Most Clicked Elements
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topClicks && topClicks.length > 0 ? (
                  <div className="space-y-2">
                    {topClicks.map((click: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
                        <span className="text-white">{click.name}</span>
                        <span className="text-[#00c4b4] font-bold">{click.count} clicks</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No click data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="costs">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  API Cost Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apiCosts?.breakdown && apiCosts.breakdown.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                        <p className="text-gray-400 text-sm">Total API Calls</p>
                        <p className="text-2xl font-bold text-white">{apiCosts.totals.totalCalls}</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                        <p className="text-gray-400 text-sm">Total Tokens</p>
                        <p className="text-2xl font-bold text-purple-400">{apiCosts.totals.totalTokens.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                        <p className="text-gray-400 text-sm">Total Cost</p>
                        <p className="text-2xl font-bold text-green-400">${apiCosts.totals.totalCost.toFixed(4)}</p>
                      </div>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="text-gray-400 text-sm border-b border-slate-700">
                          <th className="text-left py-2">API Type</th>
                          <th className="text-right py-2">Calls</th>
                          <th className="text-right py-2">Tokens</th>
                          <th className="text-right py-2">Cost</th>
                          <th className="text-right py-2">Avg Response</th>
                          <th className="text-right py-2">Success Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiCosts.breakdown.map((row: any, idx: number) => (
                          <tr key={idx} className="border-t border-slate-700/50">
                            <td className="py-3 text-white font-medium">{row.apiType}</td>
                            <td className="py-3 text-right text-gray-300">{row.count}</td>
                            <td className="py-3 text-right text-purple-400">{(row.totalTokens || 0).toLocaleString()}</td>
                            <td className="py-3 text-right text-green-400">${(row.totalCost || 0).toFixed(4)}</td>
                            <td className="py-3 text-right text-gray-300">{row.avgResponseTime ? `${Math.round(row.avgResponseTime)}ms` : '-'}</td>
                            <td className="py-3 text-right">
                              <span className={row.successRate >= 95 ? 'text-green-400' : row.successRate >= 80 ? 'text-yellow-400' : 'text-red-400'}>
                                {row.successRate ? `${row.successRate.toFixed(1)}%` : '-'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No API usage data yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
