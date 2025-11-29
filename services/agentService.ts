import axios from 'axios';

const AGENT_API_URL = 'http://localhost:5001/api';

export interface ResourceUsage {
  cpu_usage: number;
  ram_usage: number;
  active_window_title: string;
  // Add other fields as needed
}

export const agentService = {
  /**
   * Check if the local python agent is running
   */
  checkStatus: async (): Promise<boolean> => {
    try {
      await axios.get(`${AGENT_API_URL}/test`, { timeout: 2000 });
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Get the local IP address from the python agent (more reliable than browser)
   */
  getLocalIP: async (): Promise<string | null> => {
    try {
      const response = await axios.get(`${AGENT_API_URL}/get-ip`, { timeout: 2000 });
      return response.data.ip_address;
    } catch (error) {
      console.warn('Failed to get IP from agent:', error);
      return null;
    }
  },

  /**
   * Get current resource usage from the agent
   */
  getResourceUsage: async (): Promise<ResourceUsage | null> => {
    try {
      const response = await axios.get(`${AGENT_API_URL}/resource-usage`, { timeout: 2000 });
      if (response.data.success) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to get resource usage:', error);
      return null;
    }
  }
};
