
interface BackupData {
    users: any[];
    reminders: any[];
    voiceSettings: any;
    aiSettings: any;
    version: string;
    lastUpdated: string;
}

const BASE_URL = 'https://api.jsonbin.io/v3/b';

export const createCloudBackup = async (apiKey: string, data: BackupData): Promise<string> => {
    const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Access-Key': apiKey, // Updated to X-Access-Key
            'X-Bin-Private': 'true', 
            'X-Bin-Name': 'FamilyMinder_Backup'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error('Failed to create cloud backup');
    }

    const result = await response.json();
    return result.metadata.id; // Return the new Bin ID
};

export const updateCloudBackup = async (apiKey: string, binId: string, data: BackupData): Promise<void> => {
    const response = await fetch(`${BASE_URL}/${binId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Access-Key': apiKey // Updated to X-Access-Key
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error('Failed to update cloud backup');
    }
};

export const fetchCloudBackup = async (apiKey: string, binId: string): Promise<BackupData> => {
    const response = await fetch(`${BASE_URL}/${binId}/latest`, {
        method: 'GET',
        headers: {
            'X-Access-Key': apiKey // Updated to X-Access-Key
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch cloud backup');
    }

    const result = await response.json();
    return result.record as BackupData;
};
