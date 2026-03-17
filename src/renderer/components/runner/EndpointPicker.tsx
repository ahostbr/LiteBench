import { useState, useEffect } from 'react';
import { Plus, Trash2, Wifi } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useEndpointsStore } from '@/stores/endpoints';

interface EndpointPickerProps {
  selected: number | null;
  onSelect: (id: number) => void;
}

export function EndpointPicker({ selected, onSelect }: EndpointPickerProps) {
  const { endpoints, loading, fetch, add, remove } = useEndpointsStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleAdd = async () => {
    if (!name || !url) return;
    const ep = await add(name, url);
    onSelect(ep.id);
    setAdding(false);
    setName('');
    setUrl('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>API Endpoint</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setAdding(!adding)}>
            <Plus size={14} /> Add
          </Button>
        </div>
      </CardHeader>

      {adding && (
        <div className="mb-4 space-y-2">
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Name (e.g. LM Studio)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Base URL (e.g. http://169.254.83.107:1234/v1)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : endpoints.length === 0 ? (
        <p className="text-sm text-zinc-500">No endpoints configured. Add one above.</p>
      ) : (
        <div className="space-y-1.5">
          {endpoints.map((ep) => (
            <div
              key={ep.id}
              onClick={() => onSelect(ep.id)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                selected === ep.id
                  ? 'bg-blue-600/15 border border-blue-600/40'
                  : 'bg-zinc-800/50 border border-transparent hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Wifi size={14} className={selected === ep.id ? 'text-blue-400' : 'text-zinc-600'} />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{ep.name}</p>
                  <p className="text-xs text-zinc-500">{ep.base_url}</p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); remove(ep.id); }}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
