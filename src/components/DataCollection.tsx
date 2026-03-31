import React, { useState, useEffect } from 'react';
import { 
  CheckCircle,
  Save,
  Calendar,
  User,
  School,
  Smartphone,
  MapPin,
  Camera,
  X,
  UploadCloud,
  Wifi,
  WifiOff,
  AlertTriangle
} from 'lucide-react';
import { MoralIndicator } from '../types';
import { api } from '../services/apiClient';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/Confirm';

const DataCollection: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
        <div>
           <h1 className="text-2xl font-bold text-slate-900">数据采集 (Data Collection)</h1>
           <p className="text-slate-500 mt-1">
             Web端录入与小程序模拟演示 (Web Entry & Mini-Program Simulation)
           </p>
        </div>
      </div>

      <WebCollectionForm />
    </div>
  );
};

const WebCollectionForm: React.FC = () => {
    const [selectedType, setSelectedType] = useState<'moral' | 'teaching'>('moral');
    const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved' | 'draft'>('idle');
    const [isOnline, setIsOnline] = useState(true); // Network simulation
    const [locationStatus, setLocationStatus] = useState<'locating' | 'success' | 'error'>('locating');
    const [gpsCoords, setGpsCoords] = useState<{lat: number, lng: number} | null>(null);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [indicators, setIndicators] = useState<MoralIndicator[]>([]);
    const [loadingIndicators, setLoadingIndicators] = useState(false);
    const { toast } = useToast();
    const { confirm } = useConfirm();
    
    // Form States
    const [selectedIndicatorId, setSelectedIndicatorId] = useState('');
    const [targetName, setTargetName] = useState('');
    const [description, setDescription] = useState('');

    // Load indicators from API
    useEffect(() => {
        const loadIndicators = async () => {
            setLoadingIndicators(true);
            try {
                const response = await api.get<{indicators: MoralIndicator[]}>('/api/moral/indicators');
                setIndicators(response.indicators || []);
            } catch (error) {
                console.error('Failed to load indicators:', error);
                setIndicators([]);
            } finally {
                setLoadingIndicators(false);
            }
        };
        loadIndicators();
    }, []);

    // Simulate Location Fetching on Mount
    useEffect(() => {
        const timer = setTimeout(() => {
            setGpsCoords({ lat: 34.27, lng: 108.08 });
            setLocationStatus('success');
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            // Create fake local URL for preview
            const url = URL.createObjectURL(e.target.files[0]);
            setUploadedImages([...uploadedImages, url]);
        }
    };

    const removeImage = (index: number) => {
        const newImages = [...uploadedImages];
        newImages.splice(index, 1);
        setUploadedImages(newImages);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormStatus('saving');
        
        // Simulate API Processing
        setTimeout(() => {
            if (isOnline) {
                setFormStatus('saved');
                toast.info('数据已提交至云端数据库 (biz_moral_record)');
            } else {
                setFormStatus('draft');
                toast.success('网络不可用，数据已保存至本地草稿箱 (Local Storage)');
            }
            // Reset form partially
            setTimeout(() => setFormStatus('idle'), 2000);
        }, 1000);
    };

    const selectedIndicator = indicators.find(i => i.id === selectedIndicatorId);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form Area */}
            <div className="lg:col-span-2 space-y-6">
                {/* Network Simulator Toggle (Demo Purpose) */}
                <div className="flex items-center justify-end space-x-2 text-xs text-slate-500">
                    <span>环境模拟:</span>
                    <button 
                        onClick={() => setIsOnline(!isOnline)}
                        className={`flex items-center px-2 py-1 rounded border ${isOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                    >
                        {isOnline ? <Wifi size={14} className="mr-1"/> : <WifiOff size={14} className="mr-1"/>}
                        {isOnline ? '在线模式' : '离线模式'}
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800">
                            {selectedType === 'moral' ? '德育量化录入' : '教学评价录入'}
                        </h3>
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => setSelectedType('moral')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedType === 'moral' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600'}`}
                            >
                                学生
                            </button>
                            <button 
                                onClick={() => setSelectedType('teaching')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${selectedType === 'teaching' ? 'bg-blue-600 text-white' : 'bg-white border text-slate-600'}`}
                            >
                                教师
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* 1. Object & Rule */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {selectedType === 'moral' ? '涉及班级/学生' : '涉及教师'}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        {selectedType === 'moral' ? <School className="h-5 w-5 text-slate-400" /> : <User className="h-5 w-5 text-slate-400" />} 
                                    </div>
                                    <input 
                                        type="text" 
                                        value={targetName}
                                        onChange={(e) => setTargetName(e.target.value)}
                                        placeholder="输入姓名或扫描二维码..."
                                        className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" 
                                    />
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-slate-400 hover:text-blue-600" title="模拟扫码">
                                        <Smartphone size={18} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">评价指标</label>
                                <select 
                                    value={selectedIndicatorId}
                                    onChange={(e) => setSelectedIndicatorId(e.target.value)}
                                    className="block w-full py-2 px-3 border border-slate-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                                >
                                    <option value="">请选择指标...</option>
                                    {loadingIndicators ? (
                                        <option disabled>加载中...</option>
                                    ) : (
                                        indicators.map(ind => (
                                            <option key={ind.id} value={ind.id}>
                                                {ind.type === 'deduction' ? '🔴' : '🟢'} [{ind.majorCategory}] {ind.name} ({ind.type === 'deduction' ? '-' : '+'}{ind.score}分)
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* 2. Score Preview */}
                        {selectedIndicator && (
                            <div className={`p-3 rounded-lg border flex items-start space-x-3 ${selectedIndicator.type === 'deduction' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                <AlertTriangle className={`w-5 h-5 ${selectedIndicator.type === 'deduction' ? 'text-red-500' : 'text-green-500'}`} />
                                <div className="flex-1">
                                    <p className={`text-sm font-bold ${selectedIndicator.type === 'deduction' ? 'text-red-700' : 'text-green-700'}`}>
                                        本次操作将{selectedIndicator.type === 'deduction' ? '扣除' : '增加'} {selectedIndicator.score} 分
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">规则归属: {selectedIndicator.majorCategory} - {selectedIndicator.minorCategory}</p>
                                </div>
                            </div>
                        )}

                        {/* 3. Evidence (Photo) */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">现场取证 (Evidence)</label>
                            <div className="flex flex-wrap gap-3">
                                {uploadedImages.map((img, idx) => (
                                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 group">
                                        <img src={img} alt="evidence" className="w-full h-full object-cover" />
                                        <button 
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                                    <Camera className="w-6 h-6 text-slate-400" />
                                    <span className="text-[10px] text-slate-500 mt-1">拍照/上传</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                            </div>
                        </div>

                        {/* 4. Description */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">情况说明/备注</label>
                            <textarea 
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border border-slate-300 rounded-md p-2"
                                placeholder="请详细描述违规或表彰的具体情况..."
                            ></textarea>
                        </div>

                        {/* 5. Location (LBS) */}
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-md border border-slate-200">
                            <div className="flex items-center space-x-2">
                                <MapPin className={`w-4 h-4 ${locationStatus === 'success' ? 'text-blue-600' : 'text-slate-400'}`} />
                                <span className="text-xs text-slate-600">
                                    {locationStatus === 'locating' ? '正在获取位置...' : 
                                     locationStatus === 'success' ? `已定位: 教学楼区域 (${gpsCoords?.lat}, ${gpsCoords?.lng})` : 
                                     '定位失败'}
                                </span>
                            </div>
                            {locationStatus === 'success' && (
                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                                    位置校验通过
                                </span>
                            )}
                        </div>

                        <div className="flex items-center justify-end border-t border-slate-100 pt-6">
                            <button type="button" className="bg-white py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 mr-3">
                                重置
                            </button>
                            <button 
                                type="submit" 
                                disabled={formStatus === 'saving' || !targetName || !selectedIndicatorId}
                                className={`inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white transition-all ${
                                    !targetName || !selectedIndicatorId ? 'bg-slate-300 cursor-not-allowed' :
                                    isOnline 
                                        ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' 
                                        : 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500'
                                }`}
                            >
                                {formStatus === 'saving' ? (
                                    <>
                                        <span className="animate-spin mr-2">⏳</span> 处理中...
                                    </>
                                ) : (
                                    isOnline ? (
                                        <>
                                            <UploadCloud className="mr-2 h-4 w-4" /> 提交数据
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" /> 存入草稿
                                        </>
                                    )
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Sidebar: Mini Program Promo & Drafts */}
            <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold mb-2 flex items-center">
                            <Smartphone className="mr-2" /> 移动端小程序
                        </h3>
                        <p className="text-blue-100 text-xs mb-4 leading-relaxed">
                            为提升巡查效率，推荐使用微信小程序进行现场录入。支持离线存储、语音识别和批量上传。
                        </p>
                        <button className="bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-50 transition-colors w-full">
                            获取小程序码
                        </button>
                    </div>
                    {/* Decorative Circle */}
                    <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white opacity-10 rounded-full"></div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <h4 className="font-bold text-slate-800 text-sm mb-3 flex justify-between items-center">
                        本地草稿箱
                        <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">2</span>
                    </h4>
                    <div className="space-y-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer group">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-700">张三 (高一3班)</span>
                                <span className="text-[10px] text-slate-400">10:30</span>
                            </div>
                            <div className="text-xs text-red-600 mb-1">🔴 上课迟到 (-2分)</div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-100">待上传</span>
                                <UploadCloud size={14} className="text-slate-400 group-hover:text-blue-500" />
                            </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer group">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-700">305宿舍</span>
                                <span className="text-[10px] text-slate-400">昨晚</span>
                            </div>
                            <div className="text-xs text-red-600 mb-1">🔴 喧哗吵闹 (-3分)</div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-100">待上传</span>
                                <UploadCloud size={14} className="text-slate-400 group-hover:text-blue-500" />
                            </div>
                        </div>
                    </div>
                    <button className="w-full mt-3 py-2 text-xs text-blue-600 font-medium border border-dashed border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                        同步所有草稿
                    </button>
                </div>
            </div>
        </div>
    )
}

export default DataCollection;