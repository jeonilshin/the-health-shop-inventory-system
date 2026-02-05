import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function Reports() {
  const [salesSummary, setSalesSummary] = useState([]);
  const [inventorySummary, setInventorySummary] = useState([]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const [salesRes, inventoryRes] = await Promise.all([
        api.get('/reports/sales-summary'),
        api.get('/reports/inventory-summary')
      ]);
      setSalesSummary(salesRes.data);
      setInventorySummary(inventoryRes.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  return (
    <div className="container">
      <h2>Reports</h2>
      
      <div className="card">
        <h3>Sales Summary by Branch</h3>
        <table>
          <thead>
            <tr>
              <th>Branch</th>
              <th>Transactions</th>
              <th>Items Sold</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {salesSummary.map((item) => (
              <tr key={item.location_id}>
                <td>{item.location_name}</td>
                <td>{item.total_transactions || 0}</td>
                <td>{parseFloat(item.total_items_sold || 0).toFixed(2)}</td>
                <td>₱{parseFloat(item.total_revenue || 0).toFixed(2)}</td>
                <td>₱{parseFloat(item.total_cost || 0).toFixed(2)}</td>
                <td style={{ color: parseFloat(item.total_profit || 0) >= 0 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                  ₱{parseFloat(item.total_profit || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Inventory Summary by Location</h3>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Type</th>
              <th>Total Items</th>
              <th>Total Quantity</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {inventorySummary.map((item) => (
              <tr key={item.location_id}>
                <td>{item.location_name}</td>
                <td>{item.location_type}</td>
                <td>{item.total_items || 0}</td>
                <td>{parseFloat(item.total_quantity || 0).toFixed(2)}</td>
                <td>₱{parseFloat(item.total_value || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Reports;
