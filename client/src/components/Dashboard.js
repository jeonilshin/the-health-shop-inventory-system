import React, { useState, useEffect, useContext } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';

function Dashboard() {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState([]);
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, lowStockRes] = await Promise.all([
        api.get('/reports/inventory-summary'),
        api.get('/reports/low-stock?threshold=10')
      ]);
      setSummary(summaryRes.data);
      setLowStock(lowStockRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  return (
    <div className="container">
      <h2>Dashboard</h2>
      
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
            {summary.map((item) => (
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

      {lowStock.length > 0 && (
        <div className="card">
          <h3 style={{ color: '#dc3545' }}>Low Stock Alert</h3>
          <table>
            <thead>
              <tr>
                <th>Location</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((item) => (
                <tr key={item.id}>
                  <td>{item.location_name}</td>
                  <td>{item.description}</td>
                  <td>{item.unit}</td>
                  <td style={{ color: '#dc3545', fontWeight: 'bold' }}>
                    {parseFloat(item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
